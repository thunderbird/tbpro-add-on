FROM node:22.14.0
USER non-root

RUN npm install -g pnpm
WORKDIR /app
CMD ["/bin/sh", "./scripts/entry.sh"]