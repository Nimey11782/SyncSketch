FROM nginx:alpine

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/

# Copy frontend static files
COPY index.html style.css /usr/share/nginx/html/
COPY js/ /usr/share/nginx/html/js/

EXPOSE 80
