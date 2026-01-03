from django.contrib import admin
from django.urls import path
from logic import views
from logic import views_messages 
from logic import views_trade
from logic import views_my_homes

urlpatterns = [
    path('admin/', admin.site.urls),

    # Strony
    path('register', views.register, name='register'),
    #path('login', views.login, name='login'),
    path('dash', views.dash, name='dash'),
    path('Update', views.Update, name='Update'),
    path('map', views.map, name='map'),
    path('Map2', views.Map2, name='Map2'),  # jeśli faktycznie chcesz z dużej litery
    path('map775', views.map775, name='map775'),
    path('', views.map715, name='map715'),

    # API do rejestracji/logowania z zewnętrznych skryptów (user_range)
    path('api/ext/users/register/', views.api_ext_register, name='api_ext_register'),
    path('api/ext/users/login/',    views.api_ext_login,    name='api_ext_login'),
    path('api/ext/map/position/',   views.api_ext_map_position, name='api_ext_map_position'),
    path('api/ext/house/<str:id_fme>/occupy/', views.api_ext_house_occupy, name='api_ext_house_occupy'),
    

        
    # API
    path('api/house/<str:id_fme>/occupy/', views.house_occupy, name='house_occupy'),
    path('api/house/<str:id_fme>/list/', views.house_list, name='house_list'),
    path('api/house/<str:id_fme>/unlist/', views.house_unlist, name='house_unlist'),
    path('api/house/<str:id_fme>/buy/', views.house_buy, name='house_buy'),
    path('api/house/<str:id_fme>/', views.house_detail, name='house_detail'),
    path('api/house/<str:id_fme>/takeover/', views_messages.house_takeover, name='house_takeover'),
    path('api/house/<str:id_fme>/', views.house_detail, name='house_detail'),
    path('api/house/<str:id_fme>/takeover/', views_messages.house_takeover, name='house_takeover'),
    path('api/listings/nearby/', views.listings_nearby, name='listings_nearby'),
    path('api/houses/sold_nearby/', views.houses_sold_nearby, name='houses_sold_nearby'),    
    path('api/houses/owned/', views_my_homes.houses_owned, name='houses_owned'),
    path('api/houses/free_nearby/', views.houses_free_nearby, name='houses_free_nearby'),



    path("api/houses/<uuid:house_id>/split_shares/", views.split_house_shares, name="split_house_shares"),
    path("api/houses/<uuid:house_id>/split_direct/", views.house_split_direct, name="house_split_direct"),
    path(
        "api/houses/<uuid:house_id>/split_limit/request/",
        views.split_limit_request,
        name="split_limit_request",
    ),

    path(
        "api/houses/<uuid:house_id>/split_proposals/",
        views.split_proposal_create,
        name="split_proposal_create",
    ),

    path('api/map/position/', views.map_position, name='map_position'),
    path('api/map/positions/', views.map_positions, name='map_positions'),

    path(
        "api/split_proposals/<uuid:proposal_id>/vote/",
        views.split_proposal_vote,
        name="split_proposal_vote",
    ),
    path(
        "api/split_proposals/<uuid:proposal_id>/cancel/",
        views.split_proposal_cancel,
        name="split_proposal_cancel",
    ),

    # WIELKI ADMIN – split limit requests
    path(
        "api/admin/split_limit_requests/",
        views.admin_split_limit_requests,
        name="admin_split_limit_requests",
    ),
    path(
        "api/admin/split_limit_requests/<uuid:request_id>/decide/",
        views.admin_split_limit_decide,
        name="admin_split_limit_decide",
    ),



    path('api/auth/login/', views.api_login, name='api_login'),
    path('api/auth/logout/', views.api_logout, name='api_logout'),
    path('api/auth/whoami/', views.api_whoami, name='api_whoami'),
    path('api/auth/register/', views.api_register, name='api_register'),
    path('api/auth/csrf/',       views.api_csrf,       name='api_csrf'),    

    path('api/trade/finalize/', views_trade.trade_finalize, name='trade_finalize'),
    path('api/trades/mine/', views_trade.trades_mine, name='trades_mine'),


    path('api/messages/', views_messages.messages_list),
    path('api/messages/archived/', views_messages.messages_archived),
    path('api/messages/<uuid:conv_id>/', views_messages.messages_thread),
    path('api/messages/<uuid:conv_id>/stop/', views_messages.messages_stop),
    path('api/messages/', views_messages.messages_list, name='messages_list'),
    path('api/messages/prepare/', views_messages.messages_prepare, name='messages_prepare'),
    path('api/messages/start/', views_messages.messages_start, name='messages_start'),

    path('api/messages/<uuid:conv_id>/', views_messages.messages_thread, name='messages_thread'),
    path('api/messages/<uuid:conv_id>/send/', views_messages.messages_send, name='messages_send'),
    path('api/messages/<uuid:conv_id>/offer/', views_messages.messages_offer, name='messages_offer'),
    path('api/messages/<uuid:conv_id>/accept/', views_messages.messages_accept, name='messages_accept'),
    path('api/messages/<uuid:conv_id>/finalize/', views_messages.messages_finalize, name='messages_finalize'),
    path('api/messages/<uuid:conv_id>/stop/', views_messages.messages_stop, name='messages_stop'),

    path('api/chat/thread/<int:user_id>/', views.chat_thread, name='chat_thread'),
    path('api/chat/send/', views.chat_send, name='chat_send'),
    path('api/chat/inbox/',  views.chat_inbox,  name='chat_inbox'),


    # Friends / Blocked (czat 1:1)
    path('api/chat/friends/',        views.chat_friends,        name='chat_friends'),
    path('api/chat/friends/add/',    views.chat_friends_add,    name='chat_friends_add'),
    path('api/chat/friends/remove/', views.chat_friends_remove, name='chat_friends_remove'),
    path('api/chat/settings/',     views.chat_settings,    name='chat_settings'),
    path('api/chat/save_toggle/',  views.chat_save_toggle, name='chat_save_toggle'),

    path('api/chat/blocked/',        views.chat_blocked,        name='chat_blocked'),
    path('api/chat/blocked/add/',    views.chat_blocked_add,    name='chat_blocked_add'),
    path('api/chat/blocked/remove/', views.chat_blocked_remove, name='chat_blocked_remove'),
    path("api/chat/friend_position/<int:user_id>/", views.chat_friend_position, name="chat_friend_position"),


    
]
