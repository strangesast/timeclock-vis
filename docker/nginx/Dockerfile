from nginx
workdir /usr/share/nginx/html
copy server/index.html .
copy manifest.json .
copy icons ./icons
copy nginx/nginx.conf /etc/nginx/nginx.conf
expose 8080
cmd ["nginx", "-g", "daemon off;"]
