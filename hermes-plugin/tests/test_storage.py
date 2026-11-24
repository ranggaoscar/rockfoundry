from conftest import PLUGIN, load


def storage():
    return load("rockfoundry_storage", PLUGIN / "storage.py")


def test_legacy_data_is_copied_once(tmp_path):
    legacy, new = tmp_path / "legacy", tmp_path / "new"
    (legacy / "projects" / "hub").mkdir(parents=True)
    (legacy / "config.toml").write_text('roots = ["C:/x"]\n', encoding="utf-8")
    (legacy / "projects" / "hub" / "card.md").write_text("# card", encoding="utf-8")
    s = storage()
    assert s.migrate_legacy(new, legacy) is True
    assert (new / "projects" / "hub" / "card.md").read_text(encoding="utf-8") == "# card"
    (new / "config.toml").write_text('roots = ["C:/y"]\n', encoding="utf-8")
    assert s.migrate_legacy(new, legacy) is False
    assert "C:/y" in (new / "config.toml").read_text(encoding="utf-8")
    assert (legacy / "config.toml").exists()


def test_install_points_engine_at_plugin_data(tmp_path, monkeypatch):
    import rockfoundry.config as config_mod
    from rockfoundry.config import rockfoundry_home

    monkeypatch.delenv("ROCKFOUNDRY_HOME", raising=False)
    monkeypatch.setattr(config_mod, "_home_resolver", None)
    storage().install(lambda: tmp_path / "plugin-data" / "rockfoundry", legacy=tmp_path / "none")
    assert rockfoundry_home() == tmp_path / "plugin-data" / "rockfoundry"
