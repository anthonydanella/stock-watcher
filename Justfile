# Override for your own registry, e.g. `export IMAGE_NAME=registry.example:5000/stock-watcher`
image_name := env_var_or_default("IMAGE_NAME", "stock-watcher")
tag := "latest"
port := "8000"

docker-push:
    docker buildx build --platform linux/amd64 -t {{image_name}}:{{tag}} .
    docker push {{image_name}}:{{tag}}

docker-run-local:
    docker build -t {{image_name}}:{{tag}} .
    docker run -d --name stock-watcher -p {{port}}:8000 {{image_name}}:{{tag}}

docker-stop-local:
    docker stop stock-watcher || true
    docker rm stock-watcher || true
