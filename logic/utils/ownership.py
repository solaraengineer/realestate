from logic.models import HouseOwnership

def get_user_shares(house, user) -> int:
    ho = HouseOwnership.objects.filter(house=house, user_id=user.id).first()
    return ho.shares if ho else 0

def get_owners(house):
    """Zwraca listę (user, shares) dla danego domu."""
    return list(
        HouseOwnership.objects
        .filter(house=house)
        .select_related('user')
    )

def has_any_owner(house) -> bool:
    return HouseOwnership.objects.filter(house=house).exists()

def is_fully_owned_by(house, user) -> bool:
    total = house.total_shares or 1
    return get_user_shares(house, user) == total

def get_main_owner(house):
    """Największy udziałowiec."""
    return (
        HouseOwnership.objects
        .filter(house=house)
        .select_related('user')
        .order_by('-shares')
        .first()
    )
