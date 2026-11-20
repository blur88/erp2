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

## Deployment

**Ingress**:
The shared entry point for browser and API traffic to a Compose deployment of ERP.
_Avoid_: nginx (unqualified)

**Frontend server**:
The internal service that supplies the built ERP web app and its browser configuration to the Ingress.
_Avoid_: nginx (unqualified)
