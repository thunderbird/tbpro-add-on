# Technically, we're building 3 separate apps:
# 1. The Daily Brief - a Vue app that is displayed in a tab in TB
# 2. The Assist banner - a plain JS app (which may get rebuilt in Vue) that is injected at the top of individual email messages
# 3. the background.js file - built as a library, acts as a request/response handler for the other two apps

# We're using a separate watcher so that we can trigger three separate vite builds, each with their own vite configs.
find src -name "*.css" > .files_to_watch
find . -name "*.vue" -o -name "*.json" -o -name "*.ts" >> .files_to_watch
grep -v "dist/" .files_to_watch > .files_to_watch.tmp
mv .files_to_watch.tmp .files_to_watch

while true; do
  cat .files_to_watch | entr -d -c pnpm run build-dev
done
rm .files_to_watch
