alias px4_ros2="docker run -it --rm \
    --network=host -p 14540:14540/udp \
    --ipc=host --pid=host \
    --env UID=$(id -u) \
    --env GID=$(id -g) \
    px4-ros ros2"

alias fd="fdfind"
