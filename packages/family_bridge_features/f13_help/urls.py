from django.urls import path

from . import api

urlpatterns = [
    path("help/directory", api.HelpDirectoryView.as_view()),
]
