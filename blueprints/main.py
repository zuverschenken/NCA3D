from flask import (
    Blueprint, flash, g, redirect, render_template, request, url_for, send_from_directory
)

import json

model_configs_path = './static/modelConfigs.json'

bp = Blueprint('main', __name__)
@bp.route('/', methods=("GET", "POST"))
def index():
    with open(model_configs_path, 'r') as file:
        data = json.load(file)
    return render_template("main/index.html", data=data)


#required for inference concurrency in ORT
@bp.after_request
def add_headers(response):
    response.headers['Cross-Origin-Opener-Policy'] = 'same-origin'
    response.headers['Cross-Origin-Embedder-Policy'] = 'require-corp'
    return response
