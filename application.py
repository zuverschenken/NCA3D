import os

from flask import Flask
from blueprints import main


# create and configure the application
application = Flask(__name__, instance_relative_config=True)
application.config.from_mapping(
        SECRET_KEY='dev'
)
application.debug=True


# ensure the instance folder exists
try:
    os.makedirs(application.instance_path)
except OSError:
    pass

# Determine the project directory
project_dir = os.path.abspath(os.path.dirname(__file__))
print("set project dir to: " + project_dir)

# Define relative paths for the folders
STATIC_FOLDER = os.path.join(project_dir, 'static')
print("static folder: " + STATIC_FOLDER)

# Update application.config with the relative paths
application.config['STATIC_FOLDER'] = STATIC_FOLDER
    
application.register_blueprint(main.bp)
application.add_url_rule('/', endpoint='index')


