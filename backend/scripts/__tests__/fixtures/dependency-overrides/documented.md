| Override | Reason | Removal condition |
|---|---|---|
| `glob` | Exercise the global override. | Remove when both consumers declare a supported range. |
| `archiver-utils@2.1.0` | Limit the override to the verified release. | Remove when that release leaves the tree. |
| `archiver-utils@2.1.0 → glob` | Exercise the verified glob.sync consumer. | Remove when the consumer declares a supported range. |
