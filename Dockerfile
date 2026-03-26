FROM node:22-alpine

RUN apk add --no-cache curl && \
    curl -LsSf https://astral.sh/uv/install.sh | sh && \
    ln -s /root/.local/bin/uv /usr/local/bin/uv && \
    ln -s /root/.local/bin/uvx /usr/local/bin/uvx

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --production

COPY . .

ENV DATA_DIR=/app/data
RUN mkdir -p /app/data/scripts

EXPOSE 3100

VOLUME ["/app/data"]

CMD ["node", "index.js"]
