from nginx
workdir /usr/share/nginx/html
copy server/index.html .
copy nginx/site.conf /etc/nginx/sites-available/site.conf

cmd ["nginx", "-g", "daemon off;"]
