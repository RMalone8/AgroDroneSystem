# AgroDrone Backend

#### Before running the backend, you must create a .dev.vars file with the following:
* DEVICE_TOKEN=uuid-for-authorization-with-backend

The backend corresponds with [AgroDrone Frontend](https://github.com/RMalone8/AgroDroneFrontend)

Run project for local dev with:

`npm run dev`

And if communicating with the Pi over a wired connection (rpi-usb-gadget):

`npm run dev -- --host 0.0.0.0`

or at the IP that your host computer appears as to the Pi.

The Edge Node repo can be found [here](https://github.com/RMalone8/AgroDrone-Edge-Node).
