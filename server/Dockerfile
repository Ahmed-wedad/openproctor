# OpenProctor microservice image.
# Run on the tao-ce_default network so it reaches redis/pgsql by service name:
#   docker build -t openproctor-api ./server
#   docker run --rm --network tao-ce_default --env-file ./server/.env.tao -p 4000:4000 openproctor-api
FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
RUN npx tsc -p tsconfig.json

# Prune dev dependencies for a smaller runtime image
RUN npm prune --omit=dev

EXPOSE 4000

CMD ["node", "dist/index.js"]
