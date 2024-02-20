import { Capability, a, Log, containers } from "pepr";
import { WebApp } from "./crd";
import { validator } from "./crd/validator";
import { WebAppCRD } from "./crd/source/webapp.crd";
import { RegisterCRD } from "./crd/register";
import { reconciler } from "./reconciler";
import "./crd/register";
import Deploy from "./controller/generators";

export const WebAppController = new Capability({
  name: "webapp-controller",
  description: "A Kubernetes Operator that manages WebApps",
  namespaces: [],
});

const { When, Store } = WebAppController;

const defaultsResources = {
  requests: {
    cpu: "100m",
    memory: "128Mi",
  },
  limits: {
    cpu: "200m",
    memory: "256Mi",
  },
};

const defaultsSecurityContext = {
  runAsUser: 1000,
  runAsRoot: false,
  runAsGroup: 3000,
  privileged: false,
};

When(a.Pod)
  .IsCreatedOrUpdated()
  .Mutate(pod => {
    // Assign default resources to containers if they dont exist
    pod.Raw.spec?.containers?.forEach(container => {
      if (!container.resources) {
        container.resources = defaultsResources;
      }
      if (!container.securityContext) {
        container.securityContext = defaultsSecurityContext;
      }
    });

    // Assign default resources to initContainers if they dont exist
    pod.Raw.spec?.initContainers?.forEach(container => {
      if (!container.resources) {
        container.resources = defaultsResources;
      }
      if (!container.securityContext) {
        container.securityContext = defaultsSecurityContext;
      }
    });

    // Assign default resources to ephemeralContainers if they dont exist
    pod.Raw.spec?.ephemeralContainers?.forEach(container => {
      if (!container.resources) {
        container.resources = defaultsResources;
      }
      if (!container.securityContext) {
        container.securityContext = defaultsSecurityContext;
      }
    });
  })
  .Validate(pod => {
    if (pod.HasAnnotation("pepr.dev/ignore")) {
      return pod.Approve();
    }
    const podContainers = containers(pod);
    podContainers.forEach(container => {
      if (container.securityContext?.runAsUser <= 10) {
        return pod.Deny("Containers must run as a user greater than 10");
      }
      if (container.securityContext?.runAsGroup <= 10) {
        return pod.Deny("Containers must run as a group greater than 10");
      }
      if (container.securityContext?.runAsGroup <= 10) {
        return pod.Deny(
          "Containers must run with a runAsGroup greater than 10",
        );
      }
      if (container.securityContext?.privileged) {
        return pod.Deny("Containers must not run as privileged");
      }
      if (container.securityContext?.runAsNonRoot) {
        return pod.Deny("Containers must runAsNonRoot");
      }
    });
    return pod.Approve();
  });

/** Operator */
// When instance is created or updated, validate it and enqueue it for processing
When(WebApp)
  .IsCreatedOrUpdated()
  .Validate(validator)
  .Reconcile(async instance => {
    try {
      Store.setItem(instance.metadata.name, JSON.stringify(instance));
      await reconciler(instance);
    } catch (error) {
      Log.info(`Error reconciling instance of WebApp`);
    }
  });

When(WebApp)
  .IsDeleted()
  .Mutate(instance => {
    Store.removeItem(instance.Raw.metadata.name);
    instance.SetAnnotation("deletionTimestamp", new Date().toISOString());
  });

// Don't let the CRD get deleted
When(a.CustomResourceDefinition)
  .IsDeleted()
  .WithName(WebAppCRD.metadata.name)
  .Watch(() => {
    RegisterCRD();
  });

// // Don't let them be deleted
When(a.Deployment)
  .IsDeleted()
  .WithLabel("pepr.dev/operator")
  .Watch(async deploy => {
    const instance = JSON.parse(
      Store.getItem(deploy.metadata!.labels["pepr.dev/operator"]),
    ) as a.GenericKind;
    await Deploy(instance);
  });
When(a.Service)
  .IsDeleted()
  .WithLabel("pepr.dev/operator")
  .Watch(async svc => {
    const instance = JSON.parse(
      Store.getItem(svc.metadata!.labels["pepr.dev/operator"]),
    ) as a.GenericKind;
    await Deploy(instance);
  });
When(a.ConfigMap)
  .IsDeleted()
  .WithLabel("pepr.dev/operator")
  .Watch(async cm => {
    const instance = JSON.parse(
      Store.getItem(cm.metadata!.labels["pepr.dev/operator"]),
    ) as a.GenericKind;
    await Deploy(instance);
  });
