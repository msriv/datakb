import pytest
import pytest_asyncio

from services.storage.local import LocalAdapter


@pytest_asyncio.fixture
async def adapter(tmp_path):
    return LocalAdapter(str(tmp_path))


@pytest.mark.asyncio
async def test_write_and_read(adapter: LocalAdapter):
    await adapter.write("notebooks/test.ipynb", b'{"cells": []}')
    content = await adapter.read("notebooks/test.ipynb")
    assert content == b'{"cells": []}'


@pytest.mark.asyncio
async def test_exists(adapter: LocalAdapter):
    assert not await adapter.exists("missing.ipynb")
    await adapter.write("present.ipynb", b"data")
    assert await adapter.exists("present.ipynb")


@pytest.mark.asyncio
async def test_delete(adapter: LocalAdapter):
    await adapter.write("to_delete.ipynb", b"data")
    await adapter.delete("to_delete.ipynb")
    assert not await adapter.exists("to_delete.ipynb")


@pytest.mark.asyncio
async def test_list(adapter: LocalAdapter):
    await adapter.write("dir/a.ipynb", b"a")
    await adapter.write("dir/b.ipynb", b"b")
    files = await adapter.list("dir")
    assert len(files) == 2


@pytest.mark.asyncio
async def test_read_version(adapter: LocalAdapter):
    await adapter.write("nb.ipynb.versions/v1.ipynb", b"version1")
    content = await adapter.read_version("nb.ipynb", "v1.ipynb")
    assert content == b"version1"


@pytest.mark.asyncio
async def test_list_versions_empty(adapter: LocalAdapter):
    versions = await adapter.list_versions("nonexistent.ipynb")
    assert versions == []


@pytest.mark.asyncio
async def test_read_missing_raises(adapter: LocalAdapter):
    with pytest.raises(FileNotFoundError):
        await adapter.read("missing.ipynb")
