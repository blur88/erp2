| Override | Reason | Removal condition |
|---|---|---|
| `rimraf@2.7.1` | Limit the override to rimraf 2. | Remove when rimraf 2 is gone. |
| `rimraf@2.7.1 → glob` | Exercise a resolution within the declared range. | Remove when the tree resolves a supported glob. |
| `prerelease-dependency` | Exercise npm wildcard compatibility with prereleases. | Remove when the consumer targets a stable release. |
