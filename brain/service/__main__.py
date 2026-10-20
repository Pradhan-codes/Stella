"""Entry point for executing the Stella Brain service as a module (`python -m brain.service`)."""

from brain.service.server import run_server_cli

if __name__ == "__main__":
    run_server_cli()
