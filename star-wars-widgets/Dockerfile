FROM node:20-alpine

WORKDIR /app

# Ajout de tini pour une bonne gestion des signaux
RUN npm init -y && npm install express \
  && apk add --no-cache tini

EXPOSE 3001

COPY . .

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
