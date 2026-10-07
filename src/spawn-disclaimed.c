// Launch a program as its own TCC "responsible process" and wait for it.
//
// The launcher spawns ChatGPT with the DevTools pipe on fds 3/4. Spawned
// normally, macOS would attribute ChatGPT's microphone / screen / automation
// permission requests to the launcher. Disclaiming responsibility makes
// ChatGPT own its permissions, exactly as when started from the Dock.
//
// usage: spawn-disclaimed <path> [args...]   (fds 3 and 4 are inherited)

#include <errno.h>
#include <signal.h>
#include <spawn.h>
#include <stdio.h>
#include <string.h>
#include <sys/wait.h>
#include <unistd.h>

extern char **environ;
int responsibility_spawnattrs_setdisclaim(posix_spawnattr_t *attrs, int disclaim);

static pid_t child = 0;

static void forward(int sig) {
  if (child > 0) kill(child, sig);
}

int main(int argc, char **argv) {
  if (argc < 2) {
    fprintf(stderr, "usage: %s <path> [args...]\n", argv[0]);
    return 64;
  }

  posix_spawnattr_t attr;
  posix_spawnattr_init(&attr);
  responsibility_spawnattrs_setdisclaim(&attr, 1);

  int rc = posix_spawn(&child, argv[1], NULL, &attr, &argv[1], environ);
  posix_spawnattr_destroy(&attr);
  if (rc != 0) {
    fprintf(stderr, "spawn-disclaimed: %s: %s\n", argv[1], strerror(rc));
    return 127;
  }

  signal(SIGTERM, forward);
  signal(SIGINT, forward);
  signal(SIGHUP, forward);

  int status = 0;
  while (waitpid(child, &status, 0) < 0 && errno == EINTR) {
  }
  return WIFEXITED(status) ? WEXITSTATUS(status) : 128 + WTERMSIG(status);
}
