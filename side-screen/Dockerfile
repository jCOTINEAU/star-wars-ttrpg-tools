FROM node:20-alpine

WORKDIR /app

# Ajout de tini pour une bonne gestion des signaux
RUN npm init -y && npm install express socket.io jest \
  && apk add --no-cache tini

VOLUME ["/app/media"]

EXPOSE 3000

COPY . .

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]

