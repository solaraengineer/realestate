from django.contrib import admin
from django.urls import path
from logic import views
from logic import views_messages
from logic import views_auth
from logic import views_listings

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

    path('api/auth/login/', views_auth.api_login, name='api_login'),
    path('api/auth/logout/', views_auth.api_logout, name='api_logout'),
    path('api/auth/whoami/', views_auth.api_whoami, name='api_whoami'),
    path('api/auth/register/', views_auth.api_register, name='api_register'),
    path('api/auth/csrf/',       views_auth.api_csrf,       name='api_csrf'),
    path('api/profile/', views_auth.api_profile, name='api_profile'),
    path('api/profile/update/', views_auth.api_profile_update, name='api_profile_update'),
    path('api/profile/password/', views_auth.api_password_change, name='api_password_change'),
    #Listings
    path('api/listings/', views_listings.api_listings, name='api_listings'),
    path('api/listings/cheapest/', views_listings.api_listings_cheapest, name='api_listings_cheapest'),
    path('api/listings/mine/', views_listings.api_my_listings, name='api_my_listings'),
    path('api/listings/house/<uuid:house_id>/', views_listings.api_listings_by_house, name='api_listings_by_house'),
    path('api/listings/<uuid:listing_id>/', views_listings.api_listing_detail, name='api_listing_detail'),
]
