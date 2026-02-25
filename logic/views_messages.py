import json
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST
from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Q, Count, OuterRef, Subquery
from django.core.paginator import Paginator
from django_ratelimit.decorators import ratelimit

from .models import Message, Friend
from .views_jwt import require_jwt
from django.utils import timezone

User = get_user_model()


@ratelimit(key='ip', rate='60/m', block=True)
@require_GET
@csrf_protect
@ensure_csrf_cookie
@require_jwt
def api_chat_threads(request):
    user = request.user

    sent = Message.objects.filter(sender=user).values_list('receiver', flat=True)
    received = Message.objects.filter(receiver=user).values_list('sender', flat=True)

    peer_ids = set(sent) | set(received)

    last_message_subquery = Message.objects.filter(
        Q(sender=user, receiver_id=OuterRef('id')) | Q(sender_id=OuterRef('id'), receiver=user)
    ).order_by('-created_at')

    unread_subquery = Message.objects.filter(
        sender_id=OuterRef('id'),
        receiver=user,
        read_at__isnull=True
    ).values('sender_id').annotate(cnt=Count('id')).values('cnt')

    peers = User.objects.filter(id__in=peer_ids).annotate(
        last_msg_content=Subquery(last_message_subquery.values('content')[:1]),
        last_msg_time=Subquery(last_message_subquery.values('created_at')[:1]),
        unread_count=Subquery(unread_subquery)
    )

    threads = []
    for peer in peers:
        threads.append({
            'user_id': peer.id,
            'username': peer.username,
            'last_message': (peer.last_msg_content or '')[:50],
            'last_time': peer.last_msg_time.isoformat() if peer.last_msg_time else None,
            'unread': peer.unread_count or 0,
        })

    threads.sort(key=lambda x: x['last_time'] or '', reverse=True)

    return JsonResponse({'ok': True, 'threads': threads})


@ratelimit(key='ip', rate='60/m', block=True)
@require_GET
@csrf_protect
@ensure_csrf_cookie
@require_jwt
def api_chat_history(request, user_id):
    user = request.user
    page = request.GET.get('page', 1)
    per_page = request.GET.get('per_page', 50)

    try:
        per_page = max(1, min(int(per_page), 100))
    except (ValueError, TypeError):
        return JsonResponse({'ok': False, 'error': 'INVALID_PER_PAGE'}, status=400)

    try:
        page = max(1, int(page))
    except (ValueError, TypeError):
        return JsonResponse({'ok': False, 'error': 'INVALID_PAGE'}, status=400)

    try:
        peer = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return JsonResponse({'ok': False, 'error': 'USER_NOT_FOUND'}, status=404)

    if Friend.objects.filter(user=peer, friend=user, status='blocked').exists():
        return JsonResponse({'ok': False, 'error': 'BLOCKED'}, status=403)

    qs = Message.objects.filter(
        Q(sender=user, receiver=peer) | Q(sender=peer, receiver=user)
    ).select_related('sender').order_by('-created_at')

    paginator = Paginator(qs, per_page)
    page_obj = paginator.get_page(page)

    history = []
    for msg in page_obj.object_list:
        history.append({
            'id': msg.id,
            'sender_id': msg.sender_id,
            'sender': msg.sender.username,
            'content': msg.content,
            'time': msg.created_at.isoformat(),
            'mine': msg.sender_id == user.id,
        })

    history.reverse()

    return JsonResponse({
        'ok': True,
        'peer': {'id': peer.id, 'username': peer.username},
        'messages': history,
        'total': paginator.count,
        'page': page_obj.number,
        'pages': paginator.num_pages,
    })


@ratelimit(key='ip', rate='30/m', block=True)
@require_POST
@csrf_protect
@ensure_csrf_cookie
@require_jwt
def api_chat_send(request):
    user = request.user

    try:
        data = json.loads(request.body.decode() or '{}')
    except json.JSONDecodeError:
        data = request.POST

    receiver_id = data.get('to') or data.get('receiver_id') or data.get('user_id')
    content = (data.get('content') or data.get('message') or '').strip()

    if not receiver_id:
        return JsonResponse({'ok': False, 'error': 'MISSING_RECEIVER'}, status=400)
    if not content:
        return JsonResponse({'ok': False, 'error': 'EMPTY_MESSAGE'}, status=400)
    if len(content) > 2000:
        return JsonResponse({'ok': False, 'error': 'MESSAGE_TOO_LONG'}, status=400)

    try:
        receiver = User.objects.get(id=receiver_id)
    except User.DoesNotExist:
        return JsonResponse({'ok': False, 'error': 'USER_NOT_FOUND'}, status=404)

    if receiver.id == user.id:
        return JsonResponse({'ok': False, 'error': 'CANNOT_MESSAGE_SELF'}, status=400)

    if Friend.objects.filter(user=receiver, friend=user, status='blocked').exists():
        return JsonResponse({'ok': False, 'error': 'BLOCKED'}, status=403)

    msg = Message.objects.create(
        sender=user,
        receiver=receiver,
        content=content,
    )

    return JsonResponse({
        'ok': True,
        'message': {
            'id': msg.id,
            'content': msg.content,
            'time': msg.created_at.isoformat(),
        }
    })


@ratelimit(key='ip', rate='30/m', block=True)
@require_POST
@csrf_protect
@ensure_csrf_cookie
@require_jwt
def api_chat_mark_read(request, user_id):
    user = request.user

    try:
        peer = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return JsonResponse({'ok': False, 'error': 'USER_NOT_FOUND'}, status=404)

    updated = Message.objects.filter(
        sender=peer,
        receiver=user,
        read_at__isnull=True
    ).update(read_at=timezone.now())

    return JsonResponse({'ok': True, 'marked': updated})


@ratelimit(key='ip', rate='60/m', block=True)
@require_GET
@csrf_protect
@ensure_csrf_cookie
@require_jwt
def api_friends_list(request):
    user = request.user

    sent = Friend.objects.filter(user=user, status='accepted').select_related('friend')
    received = Friend.objects.filter(friend=user, status='accepted').select_related('user')

    friends = []
    for f in sent:
        friends.append({
            'id': f.friend.id,
            'username': f.friend.username,
        })
    for f in received:
        friends.append({
            'id': f.user.id,
            'username': f.user.username,
        })

    return JsonResponse({'ok': True, 'friends': friends})


@ratelimit(key='ip', rate='60/m', block=True)
@require_GET
@csrf_protect
@ensure_csrf_cookie
@require_jwt
def api_friends_pending(request):
    user = request.user

    pending = Friend.objects.filter(friend=user, status='pending').select_related('user')

    requests = []
    for f in pending:
        requests.append({
            'id': f.id,
            'from_user_id': f.user.id,
            'from_username': f.user.username,
            'created_at': f.created_at.isoformat(),
        })

    return JsonResponse({'ok': True, 'requests': requests})


@ratelimit(key='ip', rate='30/m', block=True)
@require_POST
@csrf_protect
@ensure_csrf_cookie
@require_jwt
def api_friends_add(request):
    user = request.user

    try:
        data = json.loads(request.body.decode() or '{}')
    except json.JSONDecodeError:
        data = request.POST

    friend_id = data.get('user_id') or data.get('friend_id')

    if not friend_id:
        return JsonResponse({'ok': False, 'error': 'MISSING_USER_ID'}, status=400)

    try:
        friend = User.objects.get(id=friend_id)
    except User.DoesNotExist:
        return JsonResponse({'ok': False, 'error': 'USER_NOT_FOUND'}, status=404)

    if friend.id == user.id:
        return JsonResponse({'ok': False, 'error': 'CANNOT_ADD_SELF'}, status=400)

    with transaction.atomic():
        existing = Friend.objects.select_for_update().filter(
            Q(user=user, friend=friend) | Q(user=friend, friend=user)
        ).first()

        if existing:
            if existing.status == 'accepted':
                return JsonResponse({'ok': False, 'error': 'ALREADY_FRIENDS'}, status=400)
            if existing.status == 'pending':
                return JsonResponse({'ok': False, 'error': 'REQUEST_PENDING'}, status=400)
            if existing.status == 'blocked':
                return JsonResponse({'ok': False, 'error': 'BLOCKED'}, status=403)

        Friend.objects.create(user=user, friend=friend, status='pending')

    return JsonResponse({'ok': True})


@ratelimit(key='ip', rate='30/m', block=True)
@require_POST
@csrf_protect
@ensure_csrf_cookie
@require_jwt
def api_friends_accept(request):
    user = request.user

    try:
        data = json.loads(request.body.decode() or '{}')
    except json.JSONDecodeError:
        data = request.POST

    request_id = data.get('request_id')
    from_user_id = data.get('from_user_id') or data.get('user_id')

    if request_id:
        try:
            fr = Friend.objects.get(id=request_id, friend=user, status='pending')
        except Friend.DoesNotExist:
            return JsonResponse({'ok': False, 'error': 'REQUEST_NOT_FOUND'}, status=404)
    elif from_user_id:
        try:
            fr = Friend.objects.get(user_id=from_user_id, friend=user, status='pending')
        except Friend.DoesNotExist:
            return JsonResponse({'ok': False, 'error': 'REQUEST_NOT_FOUND'}, status=404)
    else:
        return JsonResponse({'ok': False, 'error': 'MISSING_REQUEST_ID'}, status=400)

    fr.status = 'accepted'
    fr.save()

    return JsonResponse({'ok': True})


@ratelimit(key='ip', rate='30/m', block=True)
@require_POST
@csrf_protect
@ensure_csrf_cookie
@require_jwt
def api_friends_remove(request):
    user = request.user

    try:
        data = json.loads(request.body.decode() or '{}')
    except json.JSONDecodeError:
        data = request.POST

    friend_id = data.get('user_id') or data.get('friend_id')

    if not friend_id:
        return JsonResponse({'ok': False, 'error': 'MISSING_USER_ID'}, status=400)

    Friend.objects.filter(
        Q(user=user, friend_id=friend_id) | Q(user_id=friend_id, friend=user)
    ).delete()

    return JsonResponse({'ok': True})


@ratelimit(key='ip', rate='60/m', block=True)
@require_GET
@csrf_protect
@ensure_csrf_cookie
@require_jwt
def api_blocked_list(request):
    user = request.user

    blocked = Friend.objects.filter(user=user, status='blocked').select_related('friend')

    users = []
    for b in blocked:
        users.append({
            'id': b.friend.id,
            'username': b.friend.username,
        })

    return JsonResponse({'ok': True, 'blocked': users})


@ratelimit(key='ip', rate='30/m', block=True)
@require_POST
@csrf_protect
@ensure_csrf_cookie
@require_jwt
def api_block_user(request):
    user = request.user

    try:
        data = json.loads(request.body.decode() or '{}')
    except json.JSONDecodeError:
        data = request.POST

    block_id = data.get('user_id')

    if not block_id:
        return JsonResponse({'ok': False, 'error': 'MISSING_USER_ID'}, status=400)

    try:
        to_block = User.objects.get(id=block_id)
    except User.DoesNotExist:
        return JsonResponse({'ok': False, 'error': 'USER_NOT_FOUND'}, status=404)

    if to_block.id == user.id:
        return JsonResponse({'ok': False, 'error': 'CANNOT_BLOCK_SELF'}, status=400)

    Friend.objects.filter(
        Q(user=user, friend=to_block) | Q(user=to_block, friend=user)
    ).delete()

    Friend.objects.create(user=user, friend=to_block, status='blocked')

    return JsonResponse({'ok': True})


@ratelimit(key='ip', rate='30/m', block=True)
@require_POST
@csrf_protect
@ensure_csrf_cookie
@require_jwt
def api_unblock_user(request):
    user = request.user

    try:
        data = json.loads(request.body.decode() or '{}')
    except json.JSONDecodeError:
        data = request.POST

    unblock_id = data.get('user_id')

    if not unblock_id:
        return JsonResponse({'ok': False, 'error': 'MISSING_USER_ID'}, status=400)

    Friend.objects.filter(user=user, friend_id=unblock_id, status='blocked').delete()

    return JsonResponse({'ok': True})


@ratelimit(key='ip', rate='60/m', block=True)
@require_GET
@csrf_protect
@ensure_csrf_cookie
@require_jwt
def api_users_search(request):
    query = request.GET.get('q', '').strip()

    if len(query) < 2:
        return JsonResponse({'ok': True, 'users': []})

    users = User.objects.filter(
        username__icontains=query
    ).exclude(id=request.user.id)[:20]

    results = []
    for u in users:
        results.append({
            'id': u.id,
            'username': u.username,
        })

    return JsonResponse({'ok': True, 'users': results})