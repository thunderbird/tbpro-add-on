# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.


from copy import deepcopy
from functools import lru_cache
import json
import os
import pprint
import re
import time
from datetime import datetime

from taskgraph.config import load_graph_config
from taskgraph.util.schema import validate_schema
from taskgraph.util import yaml
from taskgraph.util.readonlydict import ReadOnlyDict
from voluptuous import ALLOW_EXTRA, Optional, Required, Schema, Any


BASE_DIR = os.path.join(os.getcwd(), "packages/addon")
# Allowed characters in indexes, plus `:`, which we replace with a `-`
TEST_NAME_REGEX_STRING = r"""[^a-zA-Z0-9:_-]"""
TEST_NAME_REGEX = re.compile(TEST_NAME_REGEX_STRING)


class HashableReadOnlyDict(ReadOnlyDict):
    def __hash__(self):
        return hash(tuple(self.items()))


@lru_cache(maxsize=None)
def check_manifest(manifest_list):
    messages = []
    xpi_names = {}
    for manifest in manifest_list:
        xpi_names.setdefault(manifest["name"], []).append(
            manifest.get("directory", ".")
        )
        for test in manifest["tests"]:
            if TEST_NAME_REGEX.search(test):
                messages.append(
                    "Illegal test name in {}: {} !\nIllegal char regex: {}".format(
                        manifest["name"], test, TEST_NAME_REGEX_STRING
                    )
                )
    for k, v in xpi_names.items():
        if len(v) > 1:
            messages.append(
                "Duplicate xpi name {} in directories {}\nTry renaming your xpis.".format(
                    k, v
                )
            )
    if messages:
        raise Exception(
            f"Found the following issue with the package.json(s):\n{messages}"
        )


@lru_cache(maxsize=None)
def get_manifest():
    manifest_list = []
    for dir_name, subdir_list, file_list in os.walk(BASE_DIR):
        for dir_ in subdir_list:
            if dir_ in (".git", "node_modules"):
                subdir_list.remove(dir_)
                continue
        if "package.json" in file_list:
            manifest = {"tests": []}
            manifest["install-type"] = "custom"
            if dir_name != BASE_DIR:
                manifest["directory"] = dir_name.replace(f"{BASE_DIR}/", "")
            with open(os.path.join(dir_name, "package.json")) as fh:
                package_json = json.load(fh)
            manifest["tests"] = tuple(manifest["tests"])
            manifest["name"] = "thundermail"
            manifest[
                "docker-image"
            ] = "xpi.cache.level-3.docker-images.v2.node-22-pnpm-bun.latest"
            manifest_list.append(HashableReadOnlyDict(manifest))
    check_manifest(tuple(manifest_list))
    return tuple(manifest_list)


def get_xpi_config(xpi_name):
    manifest = get_manifest()
    xpi_configs = [xpi for xpi in manifest if xpi["name"] == xpi_name]
    if len(xpi_configs) != 1:
        raise Exception(
            "Unable to find a single xpi matching name {}: found {}".format(
                input.xpi_name, len(xpi_configs)
            )
        )
    return xpi_configs[0]
