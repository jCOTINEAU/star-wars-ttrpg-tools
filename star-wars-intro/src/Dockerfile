FROM myparkfolio/sass-compass AS comp
WORKDIR /app

COPY style.scss .
RUN compass compile --sass-dir . --css-dir .

# Copier le CSS généré depuis l'étape de build

FROM nginx:alpine
# Répertoire de travail nginx
WORKDIR /usr/share/nginx/html

COPY --from=comp /app/style.css ./style.css
RUN chmod +x style.css
COPY index.html .
COPY script.js .
# Exposer le port standard
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
