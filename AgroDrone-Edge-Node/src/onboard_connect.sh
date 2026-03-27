#!/bin/bash

until ping -c 1 $DRONE_PI_IP; do 
    sleep 5;
done