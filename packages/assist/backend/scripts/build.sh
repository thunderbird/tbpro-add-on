#! /usr/bin/env bash

APP_NAME="assist"
PROJECT_DIRECTORY="./backend"

# Script accepts three arguments:
# 1. The tag for the docker image
# 2. The environment (staging or production)
# 3. The AWS region

# The tag defaults to the version in the package.json or pyproject.toml file.
# The environment defaults to staging.
# The AWS region defaults to the existing $AWS_REGION env var.
# If there is no region arg and no existing env var, default to us-east-2.

# ---------------------------------------------------------
# Print usage message, if --help is the only argument
# ---------------------------------------------------------
if [ "$1" == "--help" ] && [ $# -eq 1 ]; then
    echo "Usage: $0 <tag> [environment] [aws-region]"
    echo "  <tag>         Required. The tag for the docker image."
    echo "  [environment] Optional. The environment (staging or production). Defaults to staging."
    echo "  [aws-region]  Optional. The AWS region. Defaults to existing AWS_REGION or us-east-2."
    exit 0
fi


# ---------------------------------------------------------
# Set the default values
# ---------------------------------------------------------

# Get the environment from the second command line argument
ENV=${2:-"staging"}

# Construct the config file path
CONFIG_FILE="./pulumi/config.$ENV.yaml"

# Get the AWS region from the third command line argument or use the existing AWS_REGION
AWS_REGION=${3:-$AWS_REGION}

# Set AWS_REGION if it's not already set
AWS_REGION=${AWS_REGION:-"us-east-2"}

# Determine the default tag value from $PROJECT_DIRECTORY/package.json or $PROJECT_DIRECTORY/pyproject.toml
if [ -f "$PROJECT_DIRECTORY/package.json" ]; then
    DEFAULT_TAG=$(grep '"version"' $PROJECT_DIRECTORY/package.json | head -1 | awk -F: '{ print $2 }' | sed 's/[", ]//g')
elif [ -f "$PROJECT_DIRECTORY/pyproject.toml" ]; then
    DEFAULT_TAG=$(grep '^version =' $PROJECT_DIRECTORY/pyproject.toml | head -1 | awk -F= '{ print $2 }' | sed 's/[", ]//g')
else
    DEFAULT_TAG="0.0.0-alpha.00"
fi

# Get the tag from command line argument or the default value
TAG=${1:-$DEFAULT_TAG}


# ---------------------------------------------------------
# Run commands to:
# - log into aws ecr and pass the credentials to docker
# - build the docker image
# - tag the image with the provided tag
# - push the image to the ecr
# - replace the image line in the config file
# - print a message that the script is ready for pulumi preview|up
# ---------------------------------------------------------

# Log into AWS ECR
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin 768512802988.dkr.ecr.$AWS_REGION.amazonaws.com

# Build the docker image
docker build -f $PROJECT_DIRECTORY/Dockerfile -t $APP_NAME --platform linux/amd64  $PROJECT_DIRECTORY

# Tag the image
docker tag $APP_NAME:latest 768512802988.dkr.ecr.$AWS_REGION.amazonaws.com/$APP_NAME:$TAG

# Push the image
docker push 768512802988.dkr.ecr.$AWS_REGION.amazonaws.com/$APP_NAME:$TAG

# Replace the image line in the config file
sed -i "s|image: 768512802988.dkr.ecr.$AWS_REGION.amazonaws.com/$APP_NAME:.*|image: 768512802988.dkr.ecr.$AWS_REGION.amazonaws.com/$APP_NAME:$TAG|" "$CONFIG_FILE"

# Let the user know it's ready 🚀
echo -e "\n\n\n🚀🚀🚀 Ready for pulumi preview|up"
