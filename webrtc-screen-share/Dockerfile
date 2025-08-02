FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json .

RUN npm install \
  && apk add --no-cache tini

COPY . .

EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "main.js"]
