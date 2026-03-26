FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --production

COPY . .

ENV DATA_DIR=/app/data
RUN mkdir -p /app/data/scripts

EXPOSE 3100

VOLUME ["/app/data"]

CMD ["node", "index.js"]
