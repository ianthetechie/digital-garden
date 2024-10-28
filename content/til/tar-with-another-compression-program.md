---
title: Create a Tarball with Another Compression Program
date: 2024-10-30
tags:
- shell
- compression
- tar
draft: true
---

```shell
tar --zstd -cf directory.tar.zst directory/
```

```shell
tar --use-compress-program zstd -cf directory.tar.zst directory/
```

```shell
tar --zstd -xf directory.tar.zst
```


Link to other TIL
