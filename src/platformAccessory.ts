import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { AWSEC2Platform } from './platform';
import {
  StartInstancesCommand,
  StopInstancesCommand,
  DescribeInstancesCommand,
  EC2Client,
} from '@aws-sdk/client-ec2';
declare global {
  // eslint-disable-next-line @typescript-eslint/no-empty-interface
  interface ReadableStream {}
}
/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform registers
 * Each accessory may expose multiple services of different service types.
 */
export class AWSEC2PlatformAccessory {
  private service: Service;

  constructor(
    private readonly platform: AWSEC2Platform,
    private readonly accessory: PlatformAccessory,
  ) {
    // set accessory information
    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(
        this.platform.Characteristic.Manufacturer,
        'Default-Manufacturer',
      )
      .setCharacteristic(this.platform.Characteristic.Model, 'Default-Model')
      .setCharacteristic(
        this.platform.Characteristic.SerialNumber,
        'Default-Serial',
      );

    // get the Switch service if it exists, otherwise create a new Switch service
    // you can create multiple services for each accessory
    this.service =
      this.accessory.getService(this.platform.Service.Switch) ||
      this.accessory.addService(this.platform.Service.Switch);

    // set the service name, this is what is displayed as the default name on the Home app
    // in this example we are using the name we stored in the `accessory.context` in the `discoverDevices` method.
    this.service.setCharacteristic(
      this.platform.Characteristic.Name,
      accessory.context.device.displayName,
    );

    // each service must implement at-minimum the "required characteristics" for the given service type
    // see https://developers.homebridge.io/#/service/Switch

    // register handlers for the On/Off Characteristic
    this.service
      .getCharacteristic(this.platform.Characteristic.On)
      .onSet(this.setOn.bind(this)) // SET - bind to the `setOn` method below
      .onGet(this.getOn.bind(this)); // GET - bind to the `getOn` method below

    /**
     * Creating multiple services of the same type.
     *
     * To avoid "Cannot add a Service with the same UUID another Service without also defining a unique 'subtype' property." error,
     * when creating multiple services of the same type, you need to use the following syntax to specify a name and subtype id:
     * this.accessory.getService('NAME') || this.accessory.addService(this.platform.Service.Switch, 'NAME', 'USER_DEFINED_SUBTYPE_ID');
     *
     * The USER_DEFINED_SUBTYPE must be unique to the platform accessory (if you platform exposes multiple accessories, each accessory
     * can use the same sub type id.)
     */

    // Example: add two "motion sensor" services to the accessory
    // const motionSensorOneService = this.accessory.getService('Motion Sensor One Name') ||
    //   this.accessory.addService(this.platform.Service.MotionSensor, 'Motion Sensor One Name', 'YourUniqueIdentifier-1');

    // const motionSensorTwoService = this.accessory.getService('Motion Sensor Two Name') ||
    //   this.accessory.addService(this.platform.Service.MotionSensor, 'Motion Sensor Two Name', 'YourUniqueIdentifier-2');

    /**
     * Updating characteristics values asynchronously.
     *
     * Example showing how to update the state of a Characteristic asynchronously instead
     * of using the `on('get')` handlers.
     * Here we change update the motion sensor trigger states on and off every 10 seconds
     * the `updateCharacteristic` method.
     *
     */
    // let motionDetected = false;
    // setInterval(() => {
    //   // EXAMPLE - inverse the trigger
    //   motionDetected = !motionDetected;

    //   // push the new value to HomeKit
    //   motionSensorOneService.updateCharacteristic(this.platform.Characteristic.MotionDetected, motionDetected);
    //   motionSensorTwoService.updateCharacteristic(this.platform.Characteristic.MotionDetected, !motionDetected);

    //   this.platform.log.debug('Triggering motionSensorOneService:', motionDetected);
    //   this.platform.log.debug('Triggering motionSensorTwoService:', !motionDetected);
    // }, 10000);
  }

  /**
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory, for example, turning on a Light bulb.
   */
  async setOn(value: CharacteristicValue) {
    // implement your own code to turn your device on/off
    const ec2 = await this.setupEC2Client();

    // Start Instance
    try {
      if ((value as boolean) === true) {
        const startInstancesCommand = new StartInstancesCommand({
          InstanceIds: [this.accessory.context.device.instanceId],
        });
        const startInstancesResponse = await ec2.send(startInstancesCommand);
        this.platform.log.debug(
          'StartInstancesCommand response:',
          startInstancesResponse,
        );
      }
    } catch (error) {
      this.platform.log.error('StartInstancesCommand error:', error);
    }

    // Stop Instance
    try {
      if ((value as boolean) === false) {
        const stopInstancesCommand = new StopInstancesCommand({
          InstanceIds: [this.accessory.context.device.instanceId],
        });
        const stopInstancesResponse = await ec2.send(stopInstancesCommand);
        this.platform.log.debug(
          'StopInstancesCommand response:',
          stopInstancesResponse,
        );
      }
    } catch (error) {
      this.platform.log.error('StopInstancesCommand error:', error);
    }

    // // Update the state of the accessory
    // this.service.updateCharacteristic(this.platform.Characteristic.On, value);
  }

  /**
   * Handle the "GET" requests from HomeKit
   * These are sent when HomeKit wants to know the current state of the accessory, for example, checking if a Light bulb is on.
   *
   * GET requests should return as fast as possbile. A long delay here will result in
   * HomeKit being unresponsive and a bad user experience in general.
   *
   * If your device takes time to respond you should update the status of your device
   * asynchronously instead using the `updateCharacteristic` method instead.

   * @example
   * this.service.updateCharacteristic(this.platform.Characteristic.On, true)
   */
  async getOn(): Promise<CharacteristicValue> {
    // implement your own code to check if the device is on
    let isOn = false;
    const ec2 = await this.setupEC2Client();

    try {
      const describeInstancesCommand = new DescribeInstancesCommand({
        InstanceIds: [this.accessory.context.device.instanceId],
      });
      const describeInstancesResponse = await ec2.send(
        describeInstancesCommand,
      );
      if (
        describeInstancesResponse &&
        describeInstancesResponse.Reservations &&
        describeInstancesResponse.Reservations[0].Instances &&
        describeInstancesResponse.Reservations[0].Instances[0].State
      ) {
        isOn =
          describeInstancesResponse.Reservations[0].Instances[0].State.Name ===
          ('running' || 'pending');
      }
    } catch (error) {
      this.platform.log.error('AWS Response ->', error);
      throw new this.platform.api.hap.HapStatusError(
        this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
      );
    }

    this.platform.log.debug('Get Characteristic On ->', isOn);

    // if you need to return an error to show the device as "Not Responding" in the Home app:
    //throw new this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);

    return isOn;
  }

  /**
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory, for example, changing the Brightness
   */
  // async setBrightness(value: CharacteristicValue) {
  //   // implement your own code to set the brightness
  //   this.exampleStates.Brightness = value as number;

  //   this.platform.log.debug('Set Characteristic Brightness -> ', value);
  // }
  async setupEC2Client() {
    const ec2 = new EC2Client({
      region: this.accessory.context.device.region,
      credentials: {
        accessKeyId: this.accessory.context.device.accessKeyId,
        secretAccessKey: this.accessory.context.device.secretAccessKey,
      },
    });

    return ec2;
  }
}
