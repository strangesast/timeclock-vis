from node:latest as build
workdir /app
copy services/web/package*.json ./
run npm install
copy services/web .
run npm run-script build

from nginx
workdir /usr/share/nginx/html
copy services/web/static ./static
copy --from=build /app/dist ./
copy services/web/nginx.conf /etc/nginx/nginx.conf
expose 8080
volume /var/log/nginx/log
cmd ["nginx", "-g", "daemon off;"]
