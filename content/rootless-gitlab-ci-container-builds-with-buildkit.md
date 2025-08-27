---
title: Rootless GitLab CI Container Builds with BuildKit
date: 2025-07-31
tags:
- devops
---

Forgive me in advance, but this post will probably be a bit rant-y.
If you're looking for a way to do container builds in GitLab CI without a lot of fuss,
this article is for you.

# RIP Kaniko

I'm writing this post because Google recently canned yet another project: Kaniko.
This used to be pretty much the only way to build container images in Kubernetes.
This probably hasn't been the case for quite some time,
but devops is a chore for me, and my level of involvement is usually
just enough to get my actual work done.

Anyways, there are a few possible replacements, including podman buildah and BuildKit.
With not so much as a finger to the wind, I decided that BuildKit looked like the more polished and capable option,
so I went with that (even though I actually use podman on servers way more often than Docker proper).
I found the documentation for switching to be a bit lacking,
so you all get this post!

# GitLab Runner Setup

I've used GitLab CI for years and find it to be an extremely capable and easy to configure system.
Runners are [extremely easy to set up](https://docs.gitlab.com/runner/install/).
Read the docs for details, but I'll whizz through a Docker-based setup (I haven't gotten around to k8s, so this is plain Docker).

First, create a volume to persist the configuration:

```shell
docker volume create buildkit-gitlab-runner-config
```

Then, start the runner for the first time.
I've added a few flags to set up the required volumes, and ensure it restarts automatically.

```shell
docker run -d --name buildkit-gitlab-runner --restart always -v /var/run/docker.sock:/var/run/docker.sock -v buildkit-gitlab-runner-config:/etc/gitlab-runner gitlab/gitlab-runner:latest
```

The runner will launch, ish, but won't do anything useful without configuration + registration.
You can use an ephemeral instance of the runner image to register it.
This prompts you for your GitLab server URL and a token.
You get a token by logging into the GitLab admin section and registering a new runner.
I also set the default image to `moby/buildkit:rootless`, but this is optional.

```shell
docker run --rm -it -v buildkit-gitlab-runner-config:/etc/gitlab-runner gitlab/gitlab-runner:latest register
```

Next, get the path to the volume with the config using `docker volume inspect buildkit-gitlab-runner-config`.
Inside that directory (probably only readable by root),
you'll see the newly generated `config.toml`.

To enable running container builds, you'll need this in a runners.docker section:

```toml
security_opt = ["seccomp:unconfined", "apparmor:unconfined"]
```

This is a bit confusing, since the GitLab docs _do_ document this but,
at the time of this writing, there are no examples and the description of the format is confusing.
See [the BuildKit docs](https://github.com/moby/buildkit/blob/master/docs/rootless.md#docker)
section on Docker for an explanation of why these options are necessary but safe enough for rootless builds.
There's also a third flag, `systempaths=unconfined`, which I've omitted (we'll revisit in a moment).

In short, the above gets you rootless image builds from within a dockerized GitLab CI runner,
**without resorting to privileged containers or docker-in-docker**.

# Example `.gitlab-ci.yml`

Now let's look at what you need to get this working in your CI configuration.
I'll assume your repo has a Dockerfile in it already and you want to build + push to your GitLab Container Registry.

```yaml
stages:
  - build

containerize:
  stage: build
  image:
    name: moby/buildkit:rootless
    entrypoint: [ "" ]  # !!
  variables:
    BUILDKITD_FLAGS: --oci-worker-no-process-sandbox
  tags:
    - docker
    - buildkit-rootless
  before_script:
    # We have some more elaborate logic to our tag naming, but that's irrelevant...
    - export IMAGE_TAG="$CI_COMMIT_TAG"
    # Container registry credentials
    - mkdir -p ~/.docker
    - echo "{\"auths\":{\"$CI_REGISTRY\":{\"username\":\"$CI_REGISTRY_USER\",\"password\":\"$CI_REGISTRY_PASSWORD\"}}}" > ~/.docker/config.json
  script:
    - buildctl-daemonless.sh build
        --frontend dockerfile.v0
        --local context=.
        --local dockerfile=.
        --output type=image,name=$CI_REGISTRY_IMAGE:$IMAGE_TAG,push=true
        --opt build-arg:CI_JOB_TOKEN=$CI_JOB_TOKEN
```

This should be pretty much copy+paste for most projects.
A few things to note:

1. The GitLab documentation does not (presently) state that you need to explicitly clear the entrypoint.
   I am not sure if I've made a mistake elsewhere in my Kaniko migration, but we needed this for Kaniko,
   and we seem to need it for BuildKit too. Without this, it launches a build daemon or something
   and sits there patiently waiting for instructions.
   Upon trying to make an MR myself, I realized [there was one already open](https://gitlab.com/gitlab-org/gitlab/-/merge_requests/199319).
2. I've added some tags.
   We operate a heterogenous bunch of self-hosted runners, and use tags to ensure the right capabilities.
   This is optional / can be adapted for your needs.
3. We set `BUILDKITD_FLAGS` using the flag that BuildKit discourages.
   Since we'd like the same config to work on k8s runners too, we have to use this.
4. This config propagates the CI job token to the Docker builder as an `ARG`. Why? I'm glad you asked...


# Bonus: Transitive dependencies, Private Repos, and Cargo

We have a lot of internal crates in private repos.
Recently I hit a snag with our previous approach to authenticated pulls though.
Our `Cargo.toml` files use git SSH links, which won't work in CI.
But you can authenticate using HTTPS and a job token!

Our previous approach was to use `sed` to rewrite `Cargo.toml` and `Cargo.lock`.
It worked until we had a transitive dependency (a direct dependency on one private crate,
which in turn had a dependency on another private crate).
I don't know why this broke exactly, since we do use `Cargo.lock`,
but regardless, it was brittle.

The solution was to amed our `Dockerfile` with an `ARG CI_JOB_TOKEN`.
The build script then does some `git` magic to rewrite the SSH requests into HTTPS ones.
I don't know why this feature exists,
but I'm happy I don't need to figure out how to run a private crate registry!

```shell
# Git hacks
git config --global credential.helper store
echo "https://gitlab-ci-token:${CI_JOB_TOKEN}@git.mycompany.com" > ~/.git-credentials
git config --global url."https://gitlab-ci-token:${CI_JOB_TOKEN}@git.mycompany.com".insteadOf ssh://git@git.mycompany.com
```

Just add this to your build script and replace the domain with your actual GitLab domain,
and you'll have no more issues with transitive dependencies and authenticated pulls.
