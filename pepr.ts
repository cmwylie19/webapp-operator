import { PeprModule } from "pepr";
import cfg from "./package.json";
import { WebAppController } from "./capabilities";
import { HelloPepr } from "./capabilities/hello-pepr";

new PeprModule(cfg, [WebAppController]);
