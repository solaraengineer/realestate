import os
from openai import OpenAI
from .models import Conversation, Message, User


def get_openai_client() -> OpenAI:
    """
    Tworzy klienta OpenAI na podstawie zmiennej środowiskowej OPENAI_API_KEY.
    Nie jest wywoływana przy imporcie modułu, tylko przy realnym użyciu.
    """
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        # Możesz tu zamiast raise zrobić np. zwrot None / stub
        raise RuntimeError("Brak ustawionego OPENAI_API_KEY – klient OpenAI jest niedostępny.")
    return OpenAI(api_key=api_key)


def generate_ai_reply(conv: Conversation, owner_user: User):
    """
    Generuje odpowiedź AI w imieniu owner_user w danej rozmowie.
    Jeśli coś pójdzie nie tak, zapisuje wiadomość z błędem zamiast wywalać serwer.
    """
    try:
        client = get_openai_client()        
        # ostatnie 5 wiadomości w rozmowie, od najstarszej do najnowszej
        last_messages = list(
            conv.messages.select_related("sender")
            .order_by("-created_at")[:5]
        )[::-1]

        prompt_messages = build_prompt(last_messages, owner_user)

        # dodatkowe zabezpieczenie – upewniamy się, że to lista słowników
        if not isinstance(prompt_messages, list):
            raise ValueError(
                f"build_prompt returned {type(prompt_messages)}, expected list"
            )

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=prompt_messages,
            temperature=1.0,
            max_tokens=140,
        )

        ai_reply = response.choices[0].message.content

        Message.objects.create(
            conversation=conv,
            sender=owner_user,
            text=ai_reply,
            message_type="text",
        )

    except Exception as e:
        # jeśli OpenAI lub cokolwiek innego rzuci wyjątek – pokaż to w rozmowie
        Message.objects.create(
            conversation=conv,
            sender=owner_user,
            text=f"[AI ERROR] {type(e).__name__}: {e}",
            message_type="text",
        )


def build_prompt(messages, owner_user: User):
    """
    Buduje listę wiadomości do API OpenAI w formacie:
    [
      {"role": "system", "content": "..."},
      {"role": "user" / "assistant", "content": "..."},
      ...
    ]
    """
    system_prompt = {
        "role": "system",
        "content": (
            "Jesteś mega wyluzowanym, naturalnym i życzliwym człowiekiem. "
            "Brzmisz jak dobry znajomy, nie jak pracownik biura. "
            "Zwracasz się na 'Ty', używasz prostego, codziennego języka, możesz czasem wtrącić lekkie żarciki i emoji 🙂😉😄, "
            "ale nie przesadzaj i nie bądź nachalny. "
            "Odpowiadasz krótko i konkretnie, ale możesz dodać jedno–dwa zdania small talku, żeby rozmowa była przyjemna. "
            "Unikaj oficjalnych zwrotów typu 'Szanowny Panie', 'uprzejmie informuję' – piszesz normalnie, jak człowiek na czacie. "
            "Sprzedajesz swój wirtualny domek w serwisie cryptoeartcoin. "
            "Jeśli kupujący zadaje bardziej luźne pytanie (np. 'co myślisz o perspektywach na zyski?'), możesz odpowiedzieć swobodnie, "
            "ale nie wymyślaj faktów, których nie ma w danych. "
            "Nie udzielasz porad prawnych, podatkowych ani inwestycyjnych. Jeśli pytanie dotyczy prawa, podatków, kredytów, inwestowania "
            "albo ogólnej opłacalności, napisz po ludzku, że nie znasz się na tym. "
            "Jeśli czegoś nie wiesz albo brakuje informacji, powiedz to szczerze, np. 'szczerze mówiąc, nie wiem, musiałbym to sprawdzić'. "
            "Nie możesz odpowiadać jak chatbot – pisz tak, jakbyś naprawdę pisał do znajomego, ale zawsze z dobrą kulturą i szacunkiem."
            "Chcesz sprzedać swój domek i starsz się przekonać kupującego do zakupu, ale nie bądź nachalny ani natarczywy. "
            "Tylko jeśli rozmówca przedstawi się jako Krzyś lub Krzysztof lub to zwracaj się do niego w każdej wypowiedzi w stylu 'Medrcu', 'Najmądrzejszy Mędrcu', 'Największy Mędrcu Wszechczasów' - W innym wypadku się tak nie zwracaj do innych. i traktuj go jako osobę która wszystko wie i od której chcesz się uczyć. Nie rozmawiaj o sprzedaży  tylko chwal go za wszystko w tym szczególnie za naukę programowania. Pytaj co myśli o chatgpt i Gemini"

        ),
    }

    chat = [system_prompt]

    for msg in messages:
        # pomijamy puste wiadomości, żeby nie wpychać śmieci do promptu
        text = (msg.text or "").strip()
        if not text:
            continue

        role = "assistant" if msg.sender_id == owner_user.id else "user"
        chat.append({"role": role, "content": text})

    return chat
