FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/
COPY seed.html /usr/share/nginx/html/
COPY script.js /usr/share/nginx/html/
COPY styles.css /usr/share/nginx/html/
COPY firebase-config.js /usr/share/nginx/html/
COPY firebase-init.js /usr/share/nginx/html/
COPY emailjs-config.js /usr/share/nginx/html/
COPY admin/ /usr/share/nginx/html/admin/

EXPOSE 80
