"""
Simple Chat API - DMs, Friends, Block
"""
import json
from functools import wraps
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_protect
from django.views.decorators.http import require_GET, require_POST
from django.contrib.auth import get_user_model
from django.db.models import Q

from .models import Message, Friend

User = get_user_model()


def login_required_json(view_func):
    """Decorator that returns JSON error instead of redirecting for unauthenticated users."""
    @wraps(view_func)
    def wrapper(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return JsonResponse({"ok": False, "error": "AUTH_REQUIRED"}, status=401)
        return view_func(request, *args, **kwargs)
    return wrapper


# ═══════════════════════════════════════════════════════════════════════════
# MESSAGES - Simple DM
# ═══════════════════════════════════════════════════════════════════════════

@login_required_json
@require_GET
def api_chat_threads(request):
    """
    Get list of chat threads (unique conversations).
    Returns users you've messaged with.
    """
    user = request.user

    # Get all users we've exchanged messages with
    sent = Message.objects.filter(sender=user).values_list('receiver', flat=True)
    received = Message.objects.filter(receiver=user).values_list('sender', flat=True)

    peer_ids = set(sent) | set(received)
    peers = User.objects.filter(id__in=peer_ids)

    threads = []
    for peer in peers:
        # Get last message
        last_msg = Message.objects.filter(
            Q(sender=user, receiver=peer) | Q(sender=peer, receiver=user)
        ).order_by('-created_at').first()

        # Count unread (messages from peer that haven't been read yet)
        unread = Message.objects.filter(sender=peer, receiver=user, read_at__isnull=True).count()

        threads.append({
            'user_id': peer.id,
            'username': peer.username,
            'last_message': last_msg.content[:50] if last_msg else '',
            'last_time': last_msg.created_at.isoformat() if last_msg else None,
            'unread': unread,
        })

    # Sort by last message time
    threads.sort(key=lambda x: x['last_time'] or '', reverse=True)

    return JsonResponse({'ok': True, 'threads': threads})


@login_required_json
@require_GET
def api_chat_history(request, user_id):
    """
    Get message history with a specific user.
    """
    user = request.user

    try:
        peer = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return JsonResponse({'ok': False, 'error': 'USER_NOT_FOUND'}, status=404)

    # Check if blocked
    if Friend.objects.filter(user=peer, friend=user, status='blocked').exists():
        return JsonResponse({'ok': False, 'error': 'BLOCKED'}, status=403)

    messages = Message.objects.filter(
        Q(sender=user, receiver=peer) | Q(sender=peer, receiver=user)
    ).order_by('created_at')

    history = []
    for msg in messages:
        history.append({
            'id': msg.id,
            'sender_id': msg.sender_id,
            'sender': msg.sender.username,
            'content': msg.content,
            'time': msg.created_at.isoformat(),
            'mine': msg.sender_id == user.id,
        })

    return JsonResponse({
        'ok': True,
        'peer': {'id': peer.id, 'username': peer.username},
        'messages': history,
    })


@login_required_json
@require_POST
@csrf_protect
def api_chat_send(request):
    """
    Send a message to a user.
    """
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

    try:
        receiver = User.objects.get(id=receiver_id)
    except User.DoesNotExist:
        return JsonResponse({'ok': False, 'error': 'USER_NOT_FOUND'}, status=404)

    if receiver.id == user.id:
        return JsonResponse({'ok': False, 'error': 'CANNOT_MESSAGE_SELF'}, status=400)

    # Check if blocked by receiver
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


@login_required_json
@require_POST
@csrf_protect
def api_chat_mark_read(request, user_id):
    """
    Mark all messages from a user as read.
    Called when opening a conversation thread.
    """
    from django.utils import timezone

    user = request.user

    try:
        peer = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return JsonResponse({'ok': False, 'error': 'USER_NOT_FOUND'}, status=404)

    # Mark all unread messages from this peer as read
    updated = Message.objects.filter(
        sender=peer,
        receiver=user,
        read_at__isnull=True
    ).update(read_at=timezone.now())

    return JsonResponse({'ok': True, 'marked': updated})


# ═══════════════════════════════════════════════════════════════════════════
# FRIENDS
# ═══════════════════════════════════════════════════════════════════════════

@login_required_json
@require_GET
def api_friends_list(request):
    """
    Get friends list (accepted friends).
    """
    user = request.user

    # Friends where I sent request and it was accepted
    sent = Friend.objects.filter(user=user, status='accepted').select_related('friend')
    # Friends where they sent request and I accepted
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


@login_required_json
@require_GET
def api_friends_pending(request):
    """
    Get pending friend requests (received).
    """
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


@login_required_json
@require_POST
@csrf_protect
def api_friends_add(request):
    """
    Send a friend request.
    """
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

    # Check if already friends or pending
    existing = Friend.objects.filter(
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


@login_required_json
@require_POST
@csrf_protect
def api_friends_accept(request):
    """
    Accept a friend request.
    """
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


@login_required_json
@require_POST
@csrf_protect
def api_friends_remove(request):
    """
    Remove a friend.
    """
    user = request.user

    try:
        data = json.loads(request.body.decode() or '{}')
    except json.JSONDecodeError:
        data = request.POST

    friend_id = data.get('user_id') or data.get('friend_id')

    if not friend_id:
        return JsonResponse({'ok': False, 'error': 'MISSING_USER_ID'}, status=400)

    # Delete friendship in both directions
    Friend.objects.filter(
        Q(user=user, friend_id=friend_id) | Q(user_id=friend_id, friend=user)
    ).delete()

    return JsonResponse({'ok': True})


# ═══════════════════════════════════════════════════════════════════════════
# BLOCK
# ═══════════════════════════════════════════════════════════════════════════

@login_required_json
@require_GET
def api_blocked_list(request):
    """
    Get list of blocked users.
    """
    user = request.user

    blocked = Friend.objects.filter(user=user, status='blocked').select_related('friend')

    users = []
    for b in blocked:
        users.append({
            'id': b.friend.id,
            'username': b.friend.username,
        })

    return JsonResponse({'ok': True, 'blocked': users})


@login_required_json
@require_POST
@csrf_protect
def api_block_user(request):
    """
    Block a user.
    """
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

    # Remove any existing friendship
    Friend.objects.filter(
        Q(user=user, friend=to_block) | Q(user=to_block, friend=user)
    ).delete()

    # Create block
    Friend.objects.create(user=user, friend=to_block, status='blocked')

    return JsonResponse({'ok': True})


@login_required_json
@require_POST
@csrf_protect
def api_unblock_user(request):
    """
    Unblock a user.
    """
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


# ═══════════════════════════════════════════════════════════════════════════
# USER SEARCH (for starting new chats)
# ═══════════════════════════════════════════════════════════════════════════

@login_required_json
@require_GET
def api_users_search(request):
    """
    Search for users by username.
    """
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
