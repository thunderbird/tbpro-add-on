#!/bin/bash

#############################################################################################
#                                                                                           #
#    -- USAGE --                                                                            #
#                                                                                           #
#  ./dev-setup $PYTHON_BIN $VENV_DIR                                                        #
#                                                                                           #
#    · $PYTHON_BIN - Path to the Python binary to use. Defaults to your system's defaults.  #
#    · $VENV_DIR - Path to create the virtual environment at. Defaults to ./.venv           #
#                                                                                           #
#############################################################################################

PYTHON_BIN=${1:-$(which python)}
VENV_DIR=${2:-"./.venv"}
DEV_SETUP_LOG_DIR="./.dev-setup"
VENV_BUILD_LOG="$DEV_SETUP_LOG_DIR/dev-setup-venv-build.log"
VENV_ACTIVATE_LOG="$DEV_SETUP_LOG_DIR/dev-setup-venv-activate.log"
VENV_PIP_LOG="$DEV_SETUP_LOG_DIR/dev-setup-venv-pip.log"
PRE_COMMIT_LOG="$DEV_SETUP_LOG_DIR/dev-setup-precommit.log"

echo -n " · Ensuring this setup tool can log its progress ............. "
if [ ! -e $DEV_SETUP_LOG_DIR ]; then
    mkdir $DEV_SETUP_LOG_DIR &> /dev/null
elif [ ! -d $DEV_SETUP_LOG_DIR ]; then
    echo "❌"
    echo
    echo "A file already exists at $DEV_SETUP_LOG_DIR, and it's not a directory. Delete this file to proceed."
    exit 1
fi

if [ ! -z $VIRTUAL_ENV ]; then
    echo "❌"
    echo
    echo "You already have a virtual environment called $VIRTUAL_ENV_PROMPT activated in your shell. Deactivate it to proceed."
    exit 1
fi
echo '✅'

echo -n " · Making sure you're not already in a virtual environment ... "
if [ ! -z $VIRTUAL_ENV ]; then
    echo "❌"
    echo
    echo "You already have a virtual environment called $VIRTUAL_ENV_PROMPT activated in your shell. Deactivate it to proceed."
    exit 1
fi
echo '✅'

echo -n " · Checking for conflicting virtual environment files ........ "
if [ -e $VENV_DIR ]; then
    if [ ! -d $VENV_DIR ]; then
        echo "❌"
        echo
        echo "A file already exists at $VENV_DIR, and it is not a directory. Either delete it or specify a different VENV_DIR."
        exit 1
    else
        VENV_EXISTS=1
    fi
else
    VENV_EXISTS=0
fi
echo '✅'

if [ $VENV_EXISTS -eq 0 ]; then
    echo -n " · Building a fresh virtual environment ...................... "
    virtualenv -p $PYTHON_BIN $VENV_DIR &> $VENV_BUILD_LOG
    if [ $? -ne 0 ]; then
        echo "❌"
        echo
        echo "The virtual environment build failed. See $VENV_BUILD_LOG for details."
        exit 1
    fi
    echo '✅'
else
    echo ' · Found a virtual environment, skipping fresh build ......... ✅'
fi

echo -n " · Activating the virtual environment ........................ "
source $VENV_DIR/bin/activate
if [ $? -ne 0 ]; then
    echo "❌"
    echo
    echo "Failed to activate the virtual environment. See $VENV_ACTIVATE_LOG for details."
    exit 1
fi
echo '✅'

echo -n " · Installing/updating dev dependencies ...................... "
pip install -U .[dev] &> $VENV_PIP_LOG
if [ $? -ne 0 ]; then
    echo "❌"
    echo
    echo "Installation of dependencies failed. See $VENV_PIP_LOG for details."
    exit 1
fi
echo '✅'

echo -n " · Bootstrapping pre-commit hooks ............................ "
pre-commit install &> $PRE_COMMIT_LOG
if [ $? -ne 0 ]; then
    echo "❌"
    echo
    echo "Setup of pre-commit hooks failed. See $PRE_COMMIT_LOG for details."
    exit 1
fi
echo '✅'
