# ERP

An ERP system for inventory, sales and purchasing, shipped as container images and run from a prebuilt production stack.

## Release & distribution

**Release**:
A versioned, published cut of `main`, named `vX.Y.Z`, identical across the GitHub release, its git tag and its images.
_Avoid_: Build, deploy, version bump

**Release repository**:
The Docker Hub repository `blur88/erp2`: every Release's images by version plus the latest ones, and the source production runs from.
_Avoid_: erp2 repo, prod repo

**Master repository**:
The Docker Hub repository `blur88/master`: the owner's private image store, shared across their projects; not used by production.
_Avoid_: Main repo, `blur88/all`

## Database

**Migration**:
A TypeORM-managed schema change.

**Major upgrade**:
A move of a PostgreSQL cluster from one major version to another.
_Avoid_: Migration

## Backup & Restore

**Backup**:
One complete, consistent recovery set taken at a single Recovery point: the ERP database, the PostgreSQL roles it needs, the uploaded files, and a record of when it was taken, from which Release, and how to check it is intact. A Backup missing any part, or failing its check, is not a Backup.
_Avoid_: Dump, snapshot, archive

**Recovery point**:
The moment whose data a Backup preserves; restoring a Backup returns ERP2 to that moment.

**Verified Backup**:
A Backup whose every part passed its integrity checks and whose off-host copy was read back intact, and whose Release is known. Verified says the Backup is whole; it does not say the Backup has been decrypted or restored. Only a Restore drill shows that.
_Avoid_: Tested backup, restorable backup

**Local copy**:
A short-lived copy of a Backup kept on the production machine for faster recovery. It does not protect against losing that machine, so it never counts as an off-host Backup.

**Restore drill**:
A timed rehearsal that restores an off-host Backup onto a clean environment and proves ERP2 works from it.
_Avoid_: Restore test (when meaning the full rehearsal)
