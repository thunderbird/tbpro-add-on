# Running backend locally

## 1. Create and activate venv

```sh
python3 -m venv venv
source ./venv/bin/activate  # for bash-like shells
```

## 2. Install dependencies; install application code as editable package

```sh
pip install -r requirements.txt
pip install -e .
```

## 3. Run the dev script

```sh
./scripts/dev-entry.sh
```
