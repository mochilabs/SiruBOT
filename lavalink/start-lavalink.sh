#!/bin/bash
# Use local JDK if available, otherwise try system java
if [ -d "./jdk/bin" ]; then
    JAVA_CMD="./jdk/bin/java"
else
    JAVA_CMD="java"
fi

$JAVA_CMD -jar Lavalink.jar
