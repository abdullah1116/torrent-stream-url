# Torrent Stream Url

A simple service to stream torrents via HTTP.

## Prerequisites

- [Bun](https://bun.sh/) is installed.

## Installation

1.  Clone the repository:

    ```bash
    git clone git@github.com:abdullah1116/torrent-stream-url.git
    cd torrent-stream-url
    ```

2.  Install dependencies:

    ```bash
    bun install
    ```

## Usage

To run the service:

```bash
bun run index.ts
```

The service will start on port `8000` by default. You can change the port by setting the `PORT` environment variable.

```bash
PORT=8080 bun run index.ts
```

## Endpoints

- `/magnet?link=<magnet_uri>`: Streams a torrent from a magnet URI.
- `/imdb/:id`: Streams a torrent from an IMDb ID using the YTS API.
- `/torrent-file`: it return html for handling torrent file, here you can upload torrent file

## Systemd Service Setup (Optional)

This setup allows the service to run in the background and automatically restart on failure.

1.  Create a service file:

    ```bash
    sudo nano /etc/systemd/system/torrent-stream-url.service
    ```

2.  Paste the following configuration into the file, adjusting the paths and user as necessary:

    ```
    [Unit]
    Description=Torrent Stream Url
    After=network.target

    [Service]
    User=www-data
    WorkingDirectory=/path/to/torrent-stream-url  # Replace with your actual path
    StandardOutput=file:/path/to/torrent-stream-url/out.log # Replace with your actual path
    ExecStart=/usr/local/bin/bun /path/to/torrent-stream-url/index.ts # Replace with your actual path
    Environment=PORT=8030

    [Install]
    WantedBy=default.target
    ```

    **Important:**

    - Replace `/path/to/torrent-stream-url` with the actual path to your project directory.
    - Ensure the `User` is set to a user with appropriate permissions (e.g., `www-data`).
    - Verify the path to the `bun` executable (`/usr/local/bin/bun`) is correct.

3.  Create the working directory and set ownership:

    ```bash
    sudo mkdir -p /path/to/torrent-stream-url # Replace with your actual path
    sudo chown www-data:www-data /path/to/torrent-stream-url # Replace with your actual path
    ```

4.  Enable and start the service:

    ```bash
    sudo systemctl enable torrent-stream-url.service
    sudo systemctl start torrent-stream-url.service
    ```

5.  Check the service status:

    ```bash
    sudo systemctl status torrent-stream-url.service
    ```

## Environment Variables

- `PORT`: The port the service listens on (default: `8000`).
- `RECONNECT_TIMEOUT`: Timeout in milliseconds before an inactive torrent engine is destroyed (default: `15 * 60 * 1000` - 15 minutes).

## Notes

- The service stores temporary torrent data in the `torrent-stream` folder.
- Error messages are logged to the console. When running as a service, they are logged to the file specified in the `StandardOutput` directive of the systemd service file.
