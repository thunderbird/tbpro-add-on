FROM python:3.12-bookworm

RUN mkdir app
WORKDIR /app

ENV PATH="${PATH}:/root/.local/bin"

# Using "src-layout" for `pip install -e .`
COPY src .

COPY requirements.txt .
COPY pyproject.toml .

RUN mkdir scripts
COPY scripts/dev-entry.sh scripts/dev-entry.sh

# Dev only
RUN echo '!! If the next step fails, copy .env.example to .env in the backend folder !!'
COPY .env .

RUN pip install --upgrade pip
RUN pip install -r requirements.txt
RUN pip install -e .

# Copy the json schema
COPY json json

# Copy the Jinja templates
COPY templates templates

EXPOSE 8000
CMD ["/bin/sh", "./scripts/dev-entry.sh"]
