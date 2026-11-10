#!/usr/bin/perl
# Tiny static server for tests/pages (macOS has Perl; no Node needed).
# Run from anywhere: perl tests/serve.pl, then open http://127.0.0.1:8765/tests/pages/microsoft-digits.html
use strict; use IO::Socket::INET; use File::Basename; use Cwd 'abs_path';
my $root = abs_path(dirname(__FILE__) . "/..");
my $s = IO::Socket::INET->new(LocalAddr => '127.0.0.1', LocalPort => 8765, Listen => 10, ReuseAddr => 1) or die "listen: $!";
$| = 1; print "serving $root on http://127.0.0.1:8765\n";
while (my $c = $s->accept) {
  my $req = <$c>; while (my $l = <$c>) { last if $l =~ /^\r?\n$/ }
  my ($path) = ($req // '') =~ m{^GET /([A-Za-z0-9._/-]*)};
  $path = 'tests/pages/microsoft-digits.html' if !$path;
  my $f = "$root/$path";
  if ($path !~ /\.\./ && -f $f) {
    open my $fh, '<:raw', $f; local $/; my $b = <$fh>;
    my $t = $f =~ /\.js$/ ? 'text/javascript' : $f =~ /\.css$/ ? 'text/css' : 'text/html; charset=utf-8';
    print $c "HTTP/1.1 200 OK\r\nContent-Type: $t\r\nContent-Length: " . length($b) . "\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n$b";
  } else { print $c "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n" }
  close $c;
}
