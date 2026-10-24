# Project Binder — PocketBase + static UI for Railway / Docker
FROM node:22-bookworm AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# Always fetch a Linux binary inside the image (ignore any host binary).
RUN rm -f pocketbase/pocketbase pocketbase/pocketbase.exe && npm run pb:fetch

ARG VITE_CLOUD=
ARG VITE_STRIPE_CHECKOUT_URL=
ENV VITE_CLOUD=$VITE_CLOUD \
    VITE_STRIPE_CHECKOUT_URL=$VITE_STRIPE_CHECKOUT_URL

RUN npm run build \
  && mkdir -p pocketbase/pb_public \
  && cp -R dist/. pocketbase/pb_public/

FROM node:22-bookworm-slim AS runtime
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/pocketbase/pocketbase /app/pocketbase/pocketbase
COPY --from=build /app/pocketbase/pb_public /app/pocketbase/pb_public
COPY --from=build /app/pocketbase/pb_migrations /app/pocketbase/pb_migrations
COPY --from=build /app/scripts/configure-pb-mail.cjs /app/scripts/configure-pb-mail.cjs
COPY --from=build /app/scripts/docker-entrypoint.cjs /app/scripts/docker-entrypoint.cjs

RUN chmod +x /app/pocketbase/pocketbase \
  && mkdir -p /data

ENV DATA_DIR=/data \
    PORT=8090 \
    NODE_ENV=production

EXPOSE 8090
VOLUME ["/data"]

CMD ["node", "/app/scripts/docker-entrypoint.cjs"]
