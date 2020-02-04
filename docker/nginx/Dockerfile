from node:latest as build
workdir /app
copy package*.json ./
run npm install
copy . .
run npm run-script build

from nginx
workdir /usr/share/nginx/html
copy --from=build /app/dist ./
#copy manifest.json .
#copy icons ./icons
copy nginx/nginx.conf /etc/nginx/nginx.conf
expose 8080
volume /var/log/nginx/log
cmd ["nginx", "-g", "daemon off;"]
