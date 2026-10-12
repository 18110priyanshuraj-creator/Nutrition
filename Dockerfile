FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json ./
RUN npm install
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
FROM node:22-bookworm-slim AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app ./
RUN mkdir -p /var/lib/mynutri && chown -R node:node /var/lib/mynutri
USER node
ENV DATABASE_PATH=/var/lib/mynutri/mynutri.sqlite
EXPOSE 3000
CMD ["npm","start"]