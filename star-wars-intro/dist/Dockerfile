FROM nginx:alpine

# Répertoire de travail nginx
WORKDIR /usr/share/nginx/html

# Copier les fichiers HTML, JS
COPY . .


# Exposer le port standard
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

