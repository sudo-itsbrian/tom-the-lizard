FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --production

COPY . .

RUN mkdir -p scripts

EXPOSE 3100

CMD ["node", "index.js"]
