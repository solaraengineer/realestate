from django.contrib import admin
from django.urls import path
from django.conf.urls.static import static
from django.conf import settings

from logic import views
from logic import views_auth
from logic import views_listings
from logic import views_payment
from logic import views_messages
from logic import views_user


urlpatterns = [
    path('admin/', admin.site.urls),

    # Pages
    path('map', views.map, name='map'),
    path('Map2', views.Map2, name='Map2'),
    path('map775', views.map775, name='map775'),
    path('', views.map715, name='map715'),

    # External API (bot integration)
    path('api/ext/users/register/', views.api_ext_register, name='api_ext_register'),
    path('api/ext/users/login/', views.api_ext_login, name='api_ext_login'),
    path('api/ext/map/position/', views.api_ext_map_position, name='api_ext_map_position'),
    path('api/ext/house/<str:id_fme>/occupy/', views.api_ext_house_occupy, name='api_ext_house_occupy'),

    # House API
    path('api/house/<str:id_fme>/occupy/', views.house_occupy, name='house_occupy'),
    path('api/house/<str:id_fme>/list/', views.house_list, name='house_list'),
    path('api/house/<str:id_fme>/unlist/', views.house_unlist, name='house_unlist'),
    path('api/house/<str:id_fme>/buy/', views.house_buy, name='house_buy'),
    path('api/house/<str:id_fme>/', views_user.house_detail, name='house_detail'),

    # Nearby searches
    path('api/listings/nearby/', views_user.listings_nearby, name='listings_nearby'),
    path('api/houses/free_nearby/', views_user.houses_free_nearby, name='houses_free_nearby'),

    # Map positions (Redis)
    path('api/map/position/', views.map_position, name='map_position'),
    path('api/map/positions/', views.map_positions, name='map_positions'),

    # Auth
    path('api/auth/login/', views_auth.api_login, name='api_login'),
    path('api/auth/logout/', views_auth.api_logout, name='api_logout'),
    path('api/auth/whoami/', views_auth.api_whoami, name='api_whoami'),
    path('api/auth/register/', views_auth.api_register, name='api_register'),
    path('api/auth/csrf/', views_auth.api_csrf, name='api_csrf'),
    path('api/profile/', views_auth.api_profile_update, name='api_profile_update'),

    # Listings
    path('api/listings/', views_listings.api_listings, name='api_listings'),
    path('api/listings/cheapest/', views_listings.api_listings_cheapest, name='api_listings_cheapest'),
    path('api/listings/mine/', views_listings.api_my_listings, name='api_my_listings'),
    path('api/listings/house/<uuid:house_id>/', views_listings.api_listings_by_house, name='api_listings_by_house'),
    path('api/listings/<uuid:listing_id>/', views_listings.api_listing_detail, name='api_listing_detail'),

    # My Houses and Transactions
    path('api/my/houses/', views_user.api_my_houses, name='api_my_houses'),
    path('api/my/transactions/', views_user.api_my_transactions, name='api_my_transactions'),

    # Viewpoints (camera positions - Database)
    path('api/viewpoints/', views.api_viewpoints_list, name='api_viewpoints_list'),
    path('api/viewpoints/save/', views.api_viewpoints_save, name='api_viewpoints_save'),
    path('api/viewpoints/<str:viewpoint_id>/delete/', views.api_viewpoints_delete, name='api_viewpoints_delete'),

    # Observations (house watchlist - Database)
    path('api/observations/', views.api_observations_list, name='api_observations_list'),
    path('api/observations/save/', views.api_observations_save, name='api_observations_save'),
    path('api/observations/<str:observation_id>/delete/', views.api_observations_delete, name='api_observations_delete'),
    path('api/observations/check/<str:house_id>/', views.api_observations_check, name='api_observations_check'),

    # Stripe Payments
    path('api/checkout/', views_payment.api_checkout, name='api_checkout'),
    path('api/stripe/onboard/', views_payment.api_stripe_onboard),
    path('api/stripe/onboard/complete/', views_payment.api_stripe_onboard_complete),
    path('api/stripe/onboard/refresh/', views_payment.api_stripe_onboard_refresh),
    path('api/stripe/status/', views_payment.api_stripe_status),
    path('api/stripe/webhook/', views_payment.stripe_webhook),
    path('payment/success/', views_payment.payment_success),
    path('payment/cancel/', views_payment.payment_cancel),

    # Chat / Messages / Friends
    path('api/chat/threads/', views_messages.api_chat_threads, name='api_chat_threads'),
    path('api/chat/history/<int:user_id>/', views_messages.api_chat_history, name='api_chat_history'),
    path('api/chat/send/', views_messages.api_chat_send, name='api_chat_send'),

    # Friends
    path('api/friends/', views_messages.api_friends_list, name='api_friends_list'),
    path('api/friends/pending/', views_messages.api_friends_pending, name='api_friends_pending'),
    path('api/friends/add/', views_messages.api_friends_add, name='api_friends_add'),
    path('api/friends/accept/', views_messages.api_friends_accept, name='api_friends_accept'),
    path('api/friends/remove/', views_messages.api_friends_remove, name='api_friends_remove'),

    # Block
    path('api/blocked/', views_messages.api_blocked_list, name='api_blocked_list'),
    path('api/block/', views_messages.api_block_user, name='api_block_user'),
    path('api/unblock/', views_messages.api_unblock_user, name='api_unblock_user'),

    # User search
    path('api/users/search/', views_messages.api_users_search, name='api_users_search'),
]

if settings.DEBUG:
    urlpatterns += static('/static/', document_root='static')
