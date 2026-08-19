#!/bin/sh
### Derive and export VITE_APP_ENV -- the declared environment name that
### src/config.ts reads instead of guessing from a URL substring.
###
### SOURCED (`.`), not executed, by BOTH:
###   - packages/send/frontend/scripts/build.sh (the S3/ECS web bundle)
###   - packages/addon/scripts/build.sh         (the XPI)
### One copy on purpose: the mapping below contains the environment-name
### vocabulary (prod/production, stage/staging) AND the magic hostnames, and a
### second copy that drifts would make the stage add-on and the stage web
### bundle silently report different environment names -- the add-on then
### derives the wrong THUNDERMAIL_HOST (src/menu.ts and src/background.ts
### branch on getEnvName() / isProd, and background.ts derives THUNDERMAIL_HOST
### from it). An XPI has no /config.js to be configured from at runtime, so the
### baked value is the ONLY configuration it ever gets.
###
### merge.yml (frozen) passes the environment as $ENV ("stage"/"prod") plus
### $BASE_URL. $BASE_URL is the same signal scripts/config.ts getIsEnvProd()
### already uses to pick the XPI id, so the id and the environment name can
### never disagree. This is a compatibility shim for that frozen workflow --
### delete this file (and both `. .../derive-app-env.sh` lines) if merge.yml
### ever sets VITE_APP_ENV itself.
###
### Only derived when there is a real signal ($ENV or $BASE_URL). With neither,
### VITE_APP_ENV is left ALONE rather than guessed -- an exported value would
### take precedence over Vite's .env loading, so guessing here would silently
### override a developer's own `VITE_APP_ENV=` in .env (which the shell cannot
### see). In CI, though, an unparseable signal is a hard error: there is no
### .env worth deferring to, and building an XPI with an undeclared
### environment is exactly the silent failure this file exists to prevent.
if [ -z "${VITE_APP_ENV:-}" ]; then
    case "${ENV:-}" in
        prod|production) VITE_APP_ENV=production ;;
        stage|staging)   VITE_APP_ENV=staging ;;
        dev|development) VITE_APP_ENV=development ;;
        *)
            case "${BASE_URL:-}" in
                *https://send.tb.pro*) VITE_APP_ENV=production ;;
                *send-stage.tb.pro*)   VITE_APP_ENV=staging ;;
                *localhost*)           VITE_APP_ENV=development ;;
            esac
            ;;
    esac
fi
if [ -n "${VITE_APP_ENV:-}" ]; then
    ### Exported so Vite's loadEnv reads it from process.env, where VITE_* vars
    ### take precedence over the .env file.
    export VITE_APP_ENV
    echo "  VITE_APP_ENV=$VITE_APP_ENV"
elif [ -n "${IS_CI_AUTOMATION:-}" ] && { [ -n "${ENV:-}" ] || [ -n "${BASE_URL:-}" ]; }; then
    ### CI passed a signal ($ENV/$BASE_URL) that this shim did not understand.
    ### Neither build.sh runs under `set -e`, so exit here (sourcing makes this
    ### exit the caller) rather than shipping an undeclared-environment build.
    echo "ERROR: cannot derive VITE_APP_ENV from ENV='${ENV:-}' / BASE_URL='${BASE_URL:-}'" >&2
    exit 1
else
    echo "  VITE_APP_ENV not set and not derivable from \$ENV/\$BASE_URL; leaving it to .env"
fi
